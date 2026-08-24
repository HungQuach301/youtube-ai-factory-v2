import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

export const protectedOperatePaths = [
  'packages/contracts/',
  'tests/guardrails/',
  'db/migrations/',
]

function modeLabels(labels) {
  return labels.filter((label) => /^mode=(BUILD|OPERATE|EVOLVE)$/u.test(label))
}

export function assertModeAllowed(labels, changedFiles) {
  const modes = modeLabels(labels)
  if (modes.length !== 1) throw new Error(`G13: PR must declare exactly one mode label; found ${modes.length}`)
  if (modes[0] !== 'mode=OPERATE') return { mode: modes[0], blocked: [] }
  const blocked = changedFiles.filter((file) => protectedOperatePaths.some((prefix) => file.startsWith(prefix)))
  if (blocked.length > 0) throw new Error(`G13: mode=OPERATE cannot modify protected paths:\n${blocked.join('\n')}`)
  return { mode: modes[0], blocked }
}

function changedFiles(baseSha, headSha) {
  const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', baseSha, headSha], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`G13: unable to inspect PR diff: ${result.stderr.trim()}`)
  return result.stdout.split('\n').map((file) => file.trim()).filter(Boolean)
}

export function runModeGuard({
  labelsJson = process.env.PR_LABELS_JSON,
  baseSha = process.env.BASE_SHA,
  headSha = process.env.HEAD_SHA,
} = {}) {
  if (!labelsJson || !baseSha || !headSha) throw new Error('G13: PR_LABELS_JSON, BASE_SHA and HEAD_SHA are required')
  const labels = JSON.parse(labelsJson)
  if (!Array.isArray(labels) || !labels.every((label) => typeof label === 'string')) throw new Error('G13: PR labels must be a string array')
  return assertModeAllowed(labels, changedFiles(baseSha, headSha))
}

const isMain = process.argv[1] !== undefined
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  try {
    console.log(JSON.stringify(runModeGuard(), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
