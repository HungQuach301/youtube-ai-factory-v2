import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

function exportedBlock(source: string, name: string) {
  const start = source.indexOf(`export const ${name}`)
  expect(start, `missing export ${name}`).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nexport const ', start + 1)
  return source.slice(start, next < 0 ? source.length : next)
}

describe('Stage 12 feasibility-search static guardrails', () => {
  it('keeps canonical and Sites typed mirrors shadow-only', () => {
    const canonical = read('packages/contracts/src/stage12-lra-feasibility.ts')
    const mirror = read('sites/control-plane/app/stage12-lra-feasibility-contract.ts')
    expect(canonical).toMatch(/RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH/u)
    expect(canonical).toMatch(/uploadCorrectedOutput: false/u)
    expect(canonical).toMatch(/providerCallCount: 0/u)
    expect(canonical).toMatch(/productionActivation: false/u)
    expect(mirror).toMatch(/packages\/contracts\/src\/stage12-lra-feasibility/u)
  })

  it('wires one authenticated diagnostic/execution path with no object write route', () => {
    const gateway = read('sites/control-plane/app/mcp/route.ts')
    const route = read('sites/control-plane/app/api/media-worker/'
      + 'stage12-codec-safe-lra-feasibility-search/route.ts')
    const worker = read('packages/media-worker/container-entry.mjs')
    expect(gateway).toMatch(/RUN_STAGE12_CODEC_SAFE_LRA_FEASIBILITY_SEARCH/u)
    expect(gateway).toMatch(/diagnoseTrackGVideoOneStage12CodecSafeLraFeasibility/u)
    expect(gateway).toMatch(/runTrackGVideoOneStage12CodecSafeLraFeasibility/u)
    expect(route).toMatch(/export async function GET/u)
    expect(route).toMatch(/export async function POST/u)
    expect(route).not.toMatch(/export async function PUT|putImmutable|upload/u)
    expect(worker).toMatch(/codecSafeLraFeasibilitySearchReady: stage12Ready\(\)/u)
    expect(worker).toMatch(/AT_LEAST_ONCE_COMPUTE_FENCED_SINGLE_TERMINAL_EFFECT/u)
    expect(worker).toMatch(/\/stage12\/codec-safe-lra-feasibility-search/u)
    expect(worker).toMatch(/publishStage12LraFeasibilityHeartbeat/u)
    expect(route).toMatch(/LEASE_HEARTBEAT/u)
  })

  it('persists one terminal snapshot in migration-0033 tables without updates', () => {
    const domain = read('sites/control-plane/app/track-g-video-one.ts')
    const start = domain.indexOf('async function persistStage12LraFeasibilityTerminal')
    const end = domain.indexOf('export async function recordTrackGVideoOneStage12', start)
    const persistence = domain.slice(start, end)
    expect(persistence).toMatch(/INSERT INTO stage12_codec_safe_lra_feasibility_job/u)
    expect(persistence).toMatch(/INSERT INTO stage12_codec_safe_lra_feasibility_evidence/u)
    expect(persistence).not.toMatch(/UPDATE|DELETE/u)
    expect(domain).toMatch(/commandAccepted: command !== null/u)
    expect(domain).toMatch(/replayed: true/u)
  })

  it('uses migration 0034 for renewable fenced leases and fail-closed legacy state', () => {
    const migration = read('sites/control-plane/drizzle/'
      + '0034_stage12_lra_feasibility_command_contract.sql')
    expect(migration).toMatch(/STAGE12_LRA_FEASIBILITY_PREEXISTING_STATE/u)
    expect(migration).toMatch(/LEASE_RENEWED/u)
    expect(migration).toMatch(/RECONCILED_EXPIRED/u)
    expect(migration).toMatch(/stage12_lra_feasibility_dispatch_heartbeat_unique/u)
    expect(migration).toMatch(/julianday\('now'\).*active_lease/su)
  })

  it('keeps root and Sites worker mirrors exact', () => {
    expect(read('packages/media-worker/stage12-runtime.mjs'))
      .toBe(read('sites/control-plane/packages/media-worker/stage12-runtime.mjs'))
    expect(read('packages/media-worker/container-entry.mjs'))
      .toBe(read('sites/control-plane/packages/media-worker/container-entry.mjs'))
    expect(read('packages/media-worker/stage12-lra-feasibility-controller.mjs'))
      .toBe(read('sites/control-plane/packages/media-worker/'
        + 'stage12-lra-feasibility-controller.mjs'))
    expect(read('packages/media-worker/stage12-lra-feasibility-delivery.mjs'))
      .toBe(read('sites/control-plane/packages/media-worker/'
        + 'stage12-lra-feasibility-delivery.mjs'))
  })

  it('keeps feasibility persistence exports synchronized across root and Sites schemas', () => {
    const root = read('db/schema.ts')
    const sites = read('sites/control-plane/db/schema.ts')
    for (const name of ['stage12CodecSafeLraFeasibilityJobs',
      'stage12CodecSafeLraFeasibilityEvidence',
      'stage12CodecSafeLraFeasibilityDispatchOutbox',
      'stage12CodecSafeLraFeasibilityTerminalReceipts',
      'stage12CodecSafeLraFeasibilityDispatchEvents']) {
      expect(exportedBlock(root, name)).toBe(exportedBlock(sites, name))
    }
  })

  it('makes the image CI prove feasibility readiness before any later deployment', () => {
    const workflow = read('.github/workflows/media-worker-image.yml')
    expect(workflow).toMatch(/codecSafeLraFeasibilitySearchReady == true/u)
    expect(workflow).toMatch(/AT_LEAST_ONCE_COMPUTE_FENCED_SINGLE_TERMINAL_EFFECT/u)
  })

  it('contains no attempt/ordinal 4, provider path or output upload', () => {
    const scope = [read('packages/media-worker/stage12-lra-feasibility-controller.mjs'),
      read('packages/media-worker/stage12-lra-feasibility-delivery.mjs'),
      read('packages/media-worker/stage12-runtime.mjs'),
      read('packages/contracts/src/stage12-lra-feasibility.ts'),
      read('sites/control-plane/app/stage12-lra-feasibility-dispatch.ts'),
      read('sites/control-plane/app/api/media-worker/'
        + 'stage12-codec-safe-lra-feasibility-search/route.ts'),
      read('sites/control-plane/drizzle/0033_stage12_codec_safe_lra_feasibility_search.sql'),
      read('sites/control-plane/drizzle/0034_stage12_lra_feasibility_command_contract.sql')]
      .join('\n')
    expect(scope).not.toMatch(/attempt(?:Ordinal)?\s*[:=_ ]\s*4/iu)
    expect(scope).not.toMatch(/correction(?:Ordinal)?\s*[:=_ ]\s*4/iu)
    expect(scope).not.toMatch(/providerDispatch:\s*['"]ON|provider_call_count[^\n]*[1-9]/iu)
    expect(scope).not.toMatch(/uploadCorrectedOutput:\s*true|export async function PUT/iu)
  })

  it('does not change acceptance thresholds', () => {
    const root = read('packages/contracts/src/thresholds.ts')
    const sites = read('sites/control-plane/packages/contracts/src/thresholds.ts')
    expect(root).toBe(sites)
    expect(root).toMatch(/target: -14, tolerance: 1/u)
    expect(root).toMatch(/TRUE_PEAK_MAX_DBTP: -1/u)
    expect(root).toMatch(/LRA: \{ min: 4, max: 8 \}/u)
  })
})
