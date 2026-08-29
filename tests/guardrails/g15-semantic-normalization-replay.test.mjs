import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const config = JSON.parse(await readFile('qualification-runs/g02h-semantic-normalization-replay.json', 'utf8'))
const workflow = await readFile('.github/workflows/g02h-semantic-normalization-replay.yml', 'utf8')
const runtime = await readFile('scripts/replay-semantic-normalization.py', 'utf8')

describe('G-02H-A zero-provider semantic normalization replay', () => {
  it('binds replay to the sealed G-02G-B evidence', () => {
    expect(config.source).toMatchObject({
      runId: 33230810559,
      artifactId: 9708481045,
      artifactName: 'dual-calibration-live-g-02g-b-33230810559',
      artifactZipSha256: '3a23b203cb7f6ca9a4fd6b9a1f6593309a92dde29c4bc89ee068c76a1eb60d4d',
      canonicalBundleSha256: '0ffaf572bbed5031a4ee81c82efc55d3076a29fb7d1e327cb469870617fec8fe',
      checksumEntryCount: 20,
    })
    expect(runtime).toContain('verify_source_checksums')
    expect(runtime).toContain('SOURCE_CANONICAL_HASH_MISMATCH')
  })

  it('normalizes US financial speech deterministically', () => {
    const result = execFileSync('python3', [
      'scripts/replay-semantic-normalization.py',
      '--self-test-normalization',
    ], { encoding: 'utf8' })
    expect(JSON.parse(result)).toEqual({ accepted: true, caseCount: 6 })
    expect(config.normalizationProfile.semanticSubstitutionTolerance).toBe(false)
  })

  it('inherits the measured threshold and never relaxes it', () => {
    expect(runtime).toContain('threshold = source_human["threshold"]')
    expect(runtime).not.toContain('threshold = 0.01')
    expect(runtime).toContain('RESIDUAL_MISMATCH')
  })

  it('has no provider credential or dispatch path', () => {
    expect(workflow).not.toContain('MDC_API_KEY')
    expect(workflow).not.toContain('ELEVENLABS_API_KEY')
    expect(workflow).not.toContain('api.elevenlabs.io')
    expect(runtime).not.toContain('urllib.request')
    expect(runtime).toContain('"providerCalls": 0')
    expect(workflow).toContain('actions: read')
    expect(config).toMatchObject({
      productionEligible: false,
      productionProviderDispatch: 'OFF',
      autoPublish: 'OFF',
    })
  })
})
