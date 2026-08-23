import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const evidenceUrl = new URL('./results/evidence.json', import.meta.url)
const reportUrl = new URL('./results/REPORT.md', import.meta.url)
const raw = await readFile(evidenceUrl, 'utf8')
const evidence = JSON.parse(raw)
const report = await readFile(reportUrl, 'utf8')
const digest = createHash('sha256').update(raw).digest('hex')

if (!report.includes(digest)) throw new Error('Report does not bind the evidence SHA-256.')
if (evidence.cases.length !== 16) throw new Error('Expected exactly 8 archetypes × 2 architectures.')
if (new Set(evidence.cases.map((entry) => entry.archetype)).size !== 8) throw new Error('Expected eight unique archetypes.')
if (new Set(evidence.cases.map((entry) => entry.architecture)).size !== 2) throw new Error('Expected two render architectures.')
if (evidence.cases.some((entry) => !Number.isFinite(entry.wallMs) || entry.wallMs <= 0
  || !Number.isFinite(entry.cpuSeconds) || entry.cpuSeconds <= 0
  || !Number.isSafeInteger(entry.peakRssBytes) || entry.peakRssBytes <= 0
  || !Number.isSafeInteger(entry.outputBytes) || entry.outputBytes <= 0)) {
  throw new Error('Every case must contain positive measured resources and output size.')
}
if (evidence.cases.filter((entry) => entry.headlessChromiumRequired).length !== 4) {
  throw new Error('The two Chromium archetypes must be identified in both architectures.')
}
if (evidence.profiles.length !== 3) throw new Error('Expected FULL and two REDUCED cost profiles.')
for (const profile of evidence.profiles) {
  const expected = profile.mediaComputeUsd + profile.stage14Usd
  if (Math.abs(expected - profile.wp12bMeasuredScopeUsd) > 0.0000015) throw new Error(`${profile.name} total is inconsistent.`)
  if (profile.underVideoCeiling !== (profile.wp12bMeasuredScopeUsd <= 30)) throw new Error(`${profile.name} ceiling conclusion is inconsistent.`)
}
if (evidence.inputs.stage14_fixture.model_is_qualified !== false) throw new Error('Pricing fixture must not claim qualification.')
if (!report.includes('Owner numeric confirmation is still mandatory')) throw new Error('Mandatory owner checkpoint is missing.')

process.stdout.write(`${JSON.stringify({ ok: true, evidenceSha256: digest, cases: 16, profiles: 3 })}\n`)
