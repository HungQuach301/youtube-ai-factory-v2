import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

async function source(relativePath: string): Promise<string> {
  return readFile(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('Media worker container contract', () => {
  it('requires an explicit owner approval before live calibration can run', async () => {
    const deployWorkflow = await source('../../../.github/workflows/media-worker-deploy.yml')
    const approvalStep = deployWorkflow.indexOf('Require explicit calibration approval')
    const credentialStep = deployWorkflow.indexOf('Require three scoped credentials')
    const providerStep = deployWorkflow.indexOf('Acquire real human floor and validate qualified voice')

    expect(deployWorkflow).not.toMatch(/^\s*push:\s*$/mu)
    expect(deployWorkflow).toMatch(/^\s*workflow_dispatch:\s*$/mu)
    expect(deployWorkflow).toMatch(/owner_approval_text:/u)
    expect(deployWorkflow).toMatch(/PROMOTE_CALIBRATED_MEDIA_WORKER/u)
    expect(deployWorkflow).toMatch(/MEDIA_STAGE10_VERIFY_KEY: \$\{\{ vars\.MEDIA_STAGE10_VERIFY_KEY \}\}/u)
    expect(deployWorkflow).not.toMatch(/MEDIA_STAGE10_VERIFY_KEY:\s+MCow/u)
    expect(deployWorkflow).toMatch(/MEDIA_STAGE10_VERIFY_KEY repository variable is not configured/u)
    expect(approvalStep).toBeGreaterThan(-1)
    expect(credentialStep).toBeGreaterThan(approvalStep)
    expect(providerStep).toBeGreaterThan(approvalStep)
  })

  it('exposes shared NLTK data to the non-root runtime', async () => {
    const dockerfile = await source('../Dockerfile')
    const preflight = await source('../../../scripts/verify-stage10-python-runtime.py')
    const imageWorkflow = await source('../../../.github/workflows/media-worker-image.yml')
    const deployWorkflow = await source('../../../.github/workflows/media-worker-deploy.yml')
    const entrypoint = await source('../container-entry.mjs')

    expect(dockerfile).toMatch(/ENV NLTK_DATA="?\/usr\/local\/share\/nltk_data"?/u)
    expect(dockerfile).toMatch(/nltk\.downloader -q -d "?\$\{?NLTK_DATA\}?"?/u)
    expect(dockerfile).toMatch(/USER node[\s\S]+RUN python3 \/app\/scripts\/verify-stage10-python-runtime\.py/u)
    expect(dockerfile).toMatch(/chmod 0444 \/app\/runtime-verification\/stage10-python\.json/u)
    expect(preflight).toMatch(/nltk\.data\.find\("taggers\/averaged_perceptron_tagger_eng"\)/u)
    expect(preflight).toMatch(/nltk\.data\.find\("corpora\/cmudict"\)/u)
    expect(preflight).toMatch(/G2p\(\)/u)
    expect(preflight).toMatch(/"torch", "torchaudio", "whisperx"/u)
    expect(imageWorkflow).toMatch(/Verify Stage 10 Python runtime as non-root/u)
    expect(entrypoint).toMatch(/pythonRuntimeVerified/u)
    expect(deployWorkflow).toMatch(/\.pythonRuntimeVerified == true/u)
  })

  it('reports the failing media phase without exposing stderr', async () => {
    const entrypoint = await source('../container-entry.mjs')

    expect(entrypoint).toMatch(/failureCode = 'MEDIA_TOOL_FAILED'/u)
    expect(entrypoint).toMatch(/'WHISPERX_OBSERVER_FAILED'/u)
    expect(entrypoint).toMatch(/'FFMPEG_DECODE_FAILED'/u)
    expect(entrypoint).toMatch(/'FFMPEG_ENCODE_FAILED'/u)
  })

  it('publishes structured encoded-loudness failure evidence with the running image digest', async () => {
    const entrypoint = await source('../container-entry.mjs')
    const runtime = await source('../stage12-runtime.mjs')

    expect(runtime).toMatch(/measurementsByPass/u)
    expect(runtime).toMatch(/FINAL_POST_ENCODE_LOUDNESS_VERIFICATION/u)
    expect(runtime).toMatch(/stage12LoudnessFailedPredicates/u)
    expect(entrypoint).toMatch(/stage12EncodedLoudnessFailureDiagnostic\(error, IMAGE_DIGEST\)/u)
    expect(entrypoint).toMatch(/body: JSON\.stringify\(\{ idempotencyKey, errorCode:[\s\S]+failureDiagnostic/u)
    expect(entrypoint).toMatch(/trace_id: payload\.idempotencyKey/u)
  })
})
