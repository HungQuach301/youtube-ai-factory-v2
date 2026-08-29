import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const config = JSON.parse(await readFile('qualification-runs/g02h-targeted-voice-remediation.json', 'utf8'))
const workflow = await readFile('.github/workflows/g02h-targeted-voice-remediation.yml', 'utf8')
const runtime = await readFile('scripts/run-targeted-voice-remediation.py', 'utf8')

describe('G-02H-B targeted voice remediation', () => {
  it('binds both sealed source artifacts and the exact residual set', () => {
    expect(config.sourceG02GB).toMatchObject({
      runId: 33230810559,
      canonicalBundleSha256: '0ffaf572bbed5031a4ee81c82efc55d3076a29fb7d1e327cb469870617fec8fe',
      checksumEntryCount: 20,
    })
    expect(config.sourceG02HA).toMatchObject({
      runId: 33238636625,
      canonicalBundleSha256: 'd2463b81e51f194d010c887e7643d566e5af8d3ce003e7cbe3f73427268aa552',
      checksumEntryCount: 6,
      requiredResidualSampleIds: ['finance-11'],
    })
    expect(runtime).toContain('TARGETED_RESIDUAL_SET_MISMATCH')
  })

  it('permits exactly one bounded replacement call', () => {
    expect(config.replacement).toMatchObject({
      id: 'finance-11-r1',
      replacesSampleId: 'finance-11',
      maxProviderCalls: 1,
      maxTotalCharacters: 200,
    })
    expect(config.replacement.text.length).toBeLessThanOrEqual(200)
    expect(runtime).toContain('replacement["maxProviderCalls"] != 1')
    expect(workflow.match(/ELEVENLABS_API_KEY/g)).toHaveLength(3)
    expect(workflow).not.toContain('MDC_API_KEY')
  })

  it('keeps the failed source sample and does not relax the measured threshold', () => {
    expect(runtime).toContain('"rejectedSourceSample": original')
    expect(runtime).toContain('human["threshold"]')
    expect(runtime).not.toContain('threshold = 0.01')
    expect(runtime).toContain('TARGETED_REPLAY_AUDIO_HASH_MISMATCH')
  })

  it('removes provider credentials during replay and keeps Production closed', () => {
    expect(workflow).toContain('Replay with provider credential absent')
    expect(workflow).toContain('env -u ELEVENLABS_API_KEY')
    expect(runtime).toContain('"providerCallsDuringReplay": 0')
    expect(config).toMatchObject({
      productionEligible: false,
      productionProviderDispatch: 'OFF',
      autoPublish: 'OFF',
    })
  })
})
