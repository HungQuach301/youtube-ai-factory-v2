import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, extname, relative, resolve, sep } from 'node:path'

const CONFIG_PATH = resolve('qualification-runs/g02i-anchor-seed-acquisition.json')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const canonicalize = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
}
const requireInside = (root, path) => {
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) throw new Error(`PATH_OUTSIDE_ROOT:${path}`)
}
const fileSha = async (path) => sha256(await readFile(path))
const writeExact = async (path, bytes) => {
  await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, bytes)
  const readback = await readFile(path)
  if (!readback.equals(bytes)) throw new Error(`READBACK_MISMATCH:${path}`)
  return sha256(readback)
}
const writeCanonical = async (path, value) => writeExact(path, Buffer.from(`${canonicalize(value)}\n`, 'utf8'))

async function checksumMap(root, expectedCount, allowedPrefix = '') {
  const lines = (await readFile(resolve(root, 'artifact-sha256s.txt'), 'utf8')).split('\n').filter(Boolean)
  if (lines.length !== expectedCount) throw new Error(`SOURCE_CHECKSUM_COUNT:${lines.length}:${expectedCount}`)
  const result = new Map()
  for (const line of lines) {
    const split = line.indexOf('  ')
    if (split < 0) throw new Error('SOURCE_CHECKSUM_FORMAT')
    const digest = line.slice(0, split), declared = line.slice(split + 2).replace(/^\.\//u, '')
    const relativePath = allowedPrefix !== '' && declared.startsWith(`${allowedPrefix}/`) ? declared.slice(allowedPrefix.length + 1) : declared
    const path = resolve(root, relativePath); requireInside(root, path)
    if (await fileSha(path) !== digest) throw new Error(`SOURCE_CHECKSUM_MISMATCH:${relativePath}`)
    result.set(relativePath, digest)
  }
  return result
}

function validateConfig(config) {
  if (config.workPackage !== 'G-02I-1A' || config.namespace !== 'qualification'
    || config.state !== 'SEED_ACQUISITION_ONLY' || config.productionEligible !== false
    || config.providerDispatch !== 'OFF' || config.autoPublish !== 'OFF') throw new Error('INVALID_ACQUISITION_CONFIG')
  if (config.nominations.length !== 9) throw new Error('NOMINATION_COUNT_MISMATCH')
  const keys = config.nominations.map((item) => `${item.dimension}:${item.requiredVerdict}`)
  if (new Set(keys).size !== keys.length) throw new Error('DUPLICATE_NOMINATION_KEY')
  if (config.nominations.some((item) => !['FAIL', 'PASS'].includes(item.requiredVerdict))) throw new Error('SYNTHETIC_BORDERLINE_FORBIDDEN')
}

async function verifySources(config, roots) {
  const g02eChecks = await checksumMap(roots.g02e, config.sources.g02e.checksumEntryCount, 'gold-set-materialization-output')
  if (await fileSha(resolve(roots.g02e, 'manifest.json')) !== config.sources.g02e.manifestSha256) throw new Error('G02E_MANIFEST_MISMATCH')
  const g02eManifest = JSON.parse(await readFile(resolve(roots.g02e, 'manifest.json'), 'utf8'))
  if (g02eManifest.workPackage !== 'G-02E' || g02eManifest.namespace !== 'qualification'
    || g02eManifest.sampleCount !== 16 || g02eManifest.productionEligible !== false) throw new Error('G02E_SOURCE_INVALID')

  const g02hChecks = await checksumMap(roots.g02h, config.sources.g02h.checksumEntryCount)
  const g02hManifest = JSON.parse(await readFile(resolve(roots.g02h, 'manifest.json'), 'utf8'))
  if (g02hManifest.canonicalBundleSha256 !== config.sources.g02h.canonicalBundleSha256
    || g02hManifest.passed !== true || g02hManifest.productionEligible !== false) throw new Error('G02H_SOURCE_INVALID')

  const g02i0Checks = await checksumMap(roots.g02i0, config.sources.g02i0.checksumEntryCount)
  if (await fileSha(resolve(roots.g02i0, 'manifest.json')) !== config.sources.g02i0.manifestSha256) throw new Error('G02I0_MANIFEST_MISMATCH')
  const replay = JSON.parse(await readFile(resolve(roots.g02i0, 'replay-receipt.json'), 'utf8'))
  if (replay.accepted !== true || replay.canonicalOutputHash !== config.sources.g02i0.canonicalOutputHash
    || replay.providerCallsDuringReplay !== 0) throw new Error('G02I0_REPLAY_INVALID')
  return { g02eChecks, g02hChecks, g02i0Checks }
}

async function materialize(config, roots, output) {
  validateConfig(config)
  const checks = await verifySources(config, roots)
  await mkdir(resolve(output, 'review-media'), { recursive: true })
  const basePacket = JSON.parse(await readFile(resolve(roots.g02i0, 'closure-packet.json'), 'utf8'))
  if (basePacket.workPackage !== 'G-02I-0' || basePacket.qualificationState !== 'NOT_QUALIFIED'
    || basePacket.rejectedMasters.some((slot) => slot.candidate !== null || slot.ownerJudgment !== null)
    || basePacket.rubricAnchors.some((slot) => slot.candidate !== null || slot.ownerJudgment !== null)) throw new Error('G02I0_PACKET_NOT_EMPTY')

  const pool = []
  for (const nomination of config.nominations) {
    const root = roots[nomination.source]
    const sourcePath = resolve(root, nomination.path); requireInside(root, sourcePath)
    const digest = await fileSha(sourcePath)
    const known = checks[`${nomination.source}Checks`].get(nomination.path)
    if (known !== digest) throw new Error(`NOMINATION_SOURCE_UNSEALED:${nomination.path}`)
    const slot = basePacket.rubricAnchors.find((item) => item.dimension === nomination.dimension && item.requiredVerdict === nomination.requiredVerdict)
    if (slot === undefined || slot.candidate !== null) throw new Error(`NOMINATION_SLOT_INVALID:${nomination.dimension}:${nomination.requiredVerdict}`)
    const extension = extname(nomination.path)
    const fileName = `${slot.slotId}${extension}`
    const target = resolve(output, 'review-media', fileName); requireInside(output, target)
    await copyFile(sourcePath, target)
    if (await fileSha(target) !== digest) throw new Error(`NOMINATION_COPY_MISMATCH:${slot.slotId}`)
    const sizeBytes = (await stat(target)).size
    const candidate = {
      id: `seed-${slot.slotId}`,
      provenance: nomination.source === 'g02e' ? 'sealed_synthetic_anchor_nomination' : 'sealed_qualified_tts_anchor_nomination',
      machineNominationOnly: true,
      nominationBasis: nomination.basis,
      source: {
        workPackage: nomination.source === 'g02e' ? 'G-02E' : 'G-02H-B',
        runId: config.sources[nomination.source].runId,
        artifactId: config.sources[nomination.source].artifactId,
        originalPath: nomination.path,
      },
      asset: {
        r2Key: `qualification/g-02i/anchor-candidates/${fileName}`,
        sourceR2Key: nomination.source === 'g02e' ? nomination.path : 'qualification/g-02h/replacement-audio/finance-11-r1.mp3',
        sha256: digest,
        sizeBytes,
        mediaType: extension === '.mp3' ? 'AUDIO' : 'VIDEO',
        fileName,
      },
    }
    slot.candidate = candidate
    pool.push({ slotId: slot.slotId, dimension: slot.dimension, requiredVerdict: slot.requiredVerdict, candidate, ownerJudgment: null })
  }
  basePacket.state = 'CANDIDATE_POOL_PARTIAL'
  const readiness = {
    schemaVersion: 1,
    workPackage: 'G-02I-1A',
    state: 'CANDIDATE_POOL_PARTIAL',
    calibrationReady: true,
    criticQualificationReady: false,
    productionEligible: false,
    providerCallCount: 0,
    counts: { realRejectedMasterCandidates: 0, rejectedMasterSlots: 15, anchorCandidates: pool.length, anchorSlots: 36, ownerJudgments: 0 },
    blockers: ['REJECTED_MASTER_CANDIDATES_REQUIRED:15', `RUBRIC_ANCHOR_CANDIDATES_REQUIRED:${36 - pool.length}`, 'ACTIVE_OWNER_IDENTITY_REQUIRED', 'OWNER_JUDGMENTS_REQUIRED:51', `CANDIDATE_R2_READBACK_PENDING:${pool.length}`],
  }
  const files = {}
  files['candidate-pool.json'] = await writeCanonical(resolve(output, 'candidate-pool.json'), { schemaVersion: 1, workPackage: 'G-02I-1A', nominations: pool })
  files['seeded-closure-packet.json'] = await writeCanonical(resolve(output, 'seeded-closure-packet.json'), basePacket)
  files['readiness.json'] = await writeCanonical(resolve(output, 'readiness.json'), readiness)
  const reviewSurface = await readFile(resolve(roots.g02i0, 'batch-review.html'))
  files['batch-review.html'] = await writeExact(resolve(output, 'batch-review.html'), reviewSurface)
  files['OWNER-ACTION.md'] = await writeExact(resolve(output, 'OWNER-ACTION.md'), Buffer.from('# G-02I-1A review\n\nLoad `seeded-closure-packet.json` in `batch-review.html`, then select the files in `review-media/`. The nine items are nominations only; the owner must decide whether each is a valid anchor.\n', 'utf8'))
  const manifest = { schemaVersion: 1, workPackage: 'G-02I-1A', namespace: 'qualification', state: readiness.state, createdAt: config.createdAt, productionEligible: false, providerDispatch: 'OFF', autoPublish: 'OFF', qualificationState: 'NOT_QUALIFIED', sourceBindings: config.sources, nominationCount: pool.length, ownerJudgmentCount: 0, files }
  await writeCanonical(resolve(output, 'manifest.json'), manifest)
}

async function listFiles(root) {
  const result = []
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name); requireInside(root, path)
      if (entry.isDirectory()) await walk(path)
      else result.push(relative(root, path).split(sep).join('/'))
    }
  }
  await walk(root); return result.sort()
}
async function snapshot(rootArg) {
  const root = resolve(rootArg), files = {}
  for (const name of (await listFiles(root)).filter((name) => name !== 'replay-receipt.json')) files[name] = await fileSha(resolve(root, name))
  return files
}
async function verifyReplay(firstArg, replayArg) {
  const [first, replay] = await Promise.all([snapshot(firstArg), snapshot(replayArg)])
  const firstHash = sha256(Buffer.from(canonicalize(first))), replayHash = sha256(Buffer.from(canonicalize(replay)))
  if (firstHash !== replayHash) throw new Error('IDEMPOTENT_REPLAY_MISMATCH')
  await writeCanonical(resolve(firstArg, 'replay-receipt.json'), { schemaVersion: 1, workPackage: 'G-02I-1A', accepted: true, replayed: true, canonicalOutputHash: firstHash, providerCallsDuringReplay: 0, productionEligible: false, providerDispatch: 'OFF', autoPublish: 'OFF', qualificationState: 'NOT_QUALIFIED' })
}

const args = process.argv.slice(2)
if (args[0] === '--materialize' && args.length === 5) {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'))
  await materialize(config, { g02e: resolve(args[1]), g02h: resolve(args[2]), g02i0: resolve(args[3]) }, resolve(args[4]))
} else if (args[0] === '--verify-replay' && args.length === 3) await verifyReplay(args[1], args[2])
else throw new Error('Usage: --materialize <g02e> <g02h> <g02i0> <output> | --verify-replay <first> <replay>')
