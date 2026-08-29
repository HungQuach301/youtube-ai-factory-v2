import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(await readFile('qualification-runs/g02i-anchor-seed-acquisition.json', 'utf8'))
const runtime = await readFile('scripts/build-g02i-anchor-seed-acquisition.mjs', 'utf8')
const workflow = await readFile('.github/workflows/g02i-anchor-seed-acquisition.yml', 'utf8')

describe('G-02I-1A anchor seed acquisition', () => {
  it('binds all three sealed source artifacts', () => {
    expect(config.sources.g02e).toMatchObject({ runId: 33187748930, artifactId: 9692479988, manifestSha256: '49fd4fa8989912318014795cdc977c23fe18cee12bafb0613cf6b078972ac418' })
    expect(config.sources.g02h).toMatchObject({ runId: 33239075196, artifactId: 9710824802, canonicalBundleSha256: '05ad1486bc78f2e9f7e897c6dd9dce9ec4dfbacb16a9c843cf039d43d03da0d9' })
    expect(config.sources.g02i0).toMatchObject({ runId: 33242103389, artifactId: 9711665711, canonicalOutputHash: '5ffe35ce28eaa90bf4f96b7afdfa7a7d528197c2f2b8d63c0feca7aa8040e0d7' })
  })

  it('creates nine unique, evidence-backed nominations without synthetic borderline labels', () => {
    const keys = config.nominations.map((item) => `${item.dimension}:${item.requiredVerdict}`)
    expect(config.nominations).toHaveLength(9)
    expect(new Set(keys).size).toBe(9)
    expect(config.nominations.filter((item) => item.requiredVerdict === 'FAIL')).toHaveLength(8)
    expect(config.nominations.filter((item) => item.requiredVerdict === 'PASS')).toHaveLength(1)
    expect(config.nominations.some((item) => item.requiredVerdict === 'BORDERLINE')).toBe(false)
    expect(runtime).toContain('machineNominationOnly: true')
    expect(runtime).toContain('ownerJudgment: null')
  })

  it('never converts a synthetic sample into a rejected master', () => {
    expect(runtime).toContain('realRejectedMasterCandidates: 0')
    expect(runtime).not.toContain("provenance: 'track_g_rejected_master'")
    expect(runtime).toContain('REJECTED_MASTER_CANDIDATES_REQUIRED:15')
  })

  it('is zero-provider and keeps Production fail-closed', () => {
    expect(workflow).not.toMatch(/API_KEY|secrets\./u)
    expect(runtime).toContain('providerCallsDuringReplay: 0')
    expect(config).toMatchObject({ namespace: 'qualification', productionEligible: false, providerDispatch: 'OFF', autoPublish: 'OFF' })
  })
})
