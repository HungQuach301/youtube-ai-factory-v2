import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(await readFile('qualification-runs/g02i-evidence-closure.json', 'utf8'))
const runtime = await readFile('scripts/build-g02i-evidence-closure.mjs', 'utf8')
const workflow = await readFile('.github/workflows/g02i-evidence-closure.yml', 'utf8')

describe('G-02I-0 evidence closure workspace', () => {
  it('binds the passing sealed G-02H calibration without relaxing its threshold', () => {
    expect(config.sourceCalibration).toMatchObject({
      runId: 33239075196,
      artifactId: 9710824802,
      artifactZipSha256: '51e8d62fa1ea029c8bfb109581fceb50329b1c602dbb0121c22512c786d1ae73',
      canonicalBundleSha256: '05ad1486bc78f2e9f7e897c6dd9dce9ec4dfbacb16a9c843cf039d43d03da0d9',
      threshold: 0.01,
      passed: true,
      residualSampleIds: [],
    })
    expect(runtime).not.toContain('threshold =')
  })

  it('creates exactly 15 real rejected-master slots and 36 unique dimension-verdict slots', () => {
    expect(config.targets).toMatchObject({ rejectedMasters: 15, rubricDimensions: 12, rubricAnchors: 36, ownerJudgments: 51 })
    expect(runtime).toContain("provenance === 'track_g_rejected_master'")
    expect(runtime).toContain("const VERDICTS = ['FAIL', 'BORDERLINE', 'PASS']")
    expect(runtime).toContain("candidate: null")
    expect(runtime).toContain("ownerJudgment: null")
  })

  it('keeps qualification and Production fail-closed', () => {
    expect(config).toMatchObject({ namespace: 'qualification', productionEligible: false, providerDispatch: 'OFF', autoPublish: 'OFF' })
    expect(runtime).toContain("qualificationState: 'NOT_QUALIFIED'")
    expect(runtime).toContain('EMPTY_CLOSURE_PACKET_MUST_FAIL_CLOSED')
  })

  it('is zero-provider, offline-reviewable, and replayable without credentials', () => {
    expect(workflow).not.toMatch(/API_KEY|secret|provider/iu)
    expect(workflow).toContain('Verify idempotent replay')
    expect(runtime).toContain('providerCallsDuringReplay: 0')
    expect(runtime).toContain('Trang chạy offline')
  })
})
