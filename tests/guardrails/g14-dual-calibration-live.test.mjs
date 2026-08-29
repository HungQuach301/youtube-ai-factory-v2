import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const config = JSON.parse(await readFile('qualification-runs/dual-calibration-live.json', 'utf8'))
const workflow = await readFile('.github/workflows/dual-calibration-live.yml', 'utf8')
const runtime = await readFile('scripts/run-dual-calibration-live.py', 'utf8')

describe('G-02G-B bounded live dual calibration', () => {
  it('pins the licensed human corpus and forbids retaining or rehosting it', () => {
    expect(config.dataset).toMatchObject({
      datasetId: 'cmrt70j4z001qmm07nvfsmgmr',
      licenseId: 'CC0-1.0',
      locale: 'en-US',
      retainSourceAudio: false,
      allowSpeakerReidentification: false,
      targetSamples: 12,
    })
    expect(config.ownerTermsAcceptance).toBe('RECORDED')
    expect(runtime).toContain('commonVoiceAudioRetained')
    expect(runtime).toContain('TemporaryDirectory')
    expect(runtime).toContain('MDC_DOWNLOAD_ACCESS_FORBIDDEN')
    expect(runtime).not.toContain('details = request_json')
  })

  it('bounds paid qualification calls and prevents TTS self-calibration', () => {
    const scripts = config.productionVoice.scripts
    const totalCharacters = scripts.reduce((total, item) => total + item.text.length, 0)
    expect(scripts).toHaveLength(12)
    expect(config.productionVoice.maxProviderCalls).toBe(12)
    expect(totalCharacters).toBeLessThanOrEqual(config.productionVoice.maxTotalCharacters)
    expect(config.productionVoice.maySetErrorFloor).toBe(false)
  })

  it('runs with secrets only after merge and keeps Production closed', () => {
    expect(workflow).toContain('branches:\n      - main')
    expect(workflow).not.toContain('pull_request:')
    expect(workflow).toContain('MDC_API_KEY: ${{ secrets.MDC_API_KEY }}')
    expect(workflow).toContain('ELEVENLABS_API_KEY: ${{ secrets.ELEVENLABS_API_KEY }}')
    expect(workflow).toContain('contents: read')
    expect(config).toMatchObject({
      productionEligible: false,
      productionProviderDispatch: 'OFF',
      autoPublish: 'OFF',
    })
  })

  it('replays from sealed evidence without provider calls', () => {
    expect(workflow).toContain('--replay-from "$FIRST_OUTPUT_DIR"')
    expect(runtime).toContain('providerCallsDuringReplay')
    expect(runtime).toContain('TTS_REPLAY_AUDIO_HASH_MISMATCH')
  })
})
