import { thresholds } from '@youtube-ai-factory/contracts'

export type SignalKind = keyof typeof thresholds.SOURCE_QUALITY.FRESHNESS_DAYS | 'POLICY'

export const isFresh = (kind: SignalKind, fetchedAt: string, asOf: string): boolean => {
  if (kind === 'POLICY') return true
  const elapsedMs = Date.parse(asOf) - Date.parse(fetchedAt)
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return false
  return elapsedMs <= thresholds.SOURCE_QUALITY.FRESHNESS_DAYS[kind] * 86_400_000
}

const words = (value: string): number => value.trim().split(/\s+/u).filter(Boolean).length

export const lintAudienceJob = (
  value: string,
  topicNames: readonly string[],
): { readonly valid: boolean; readonly failures: readonly string[] } => {
  const normalized = value.normalize('NFC').toLocaleLowerCase('en-US')
  const english = /^when\s+(.+?),\s*i want\s+(.+?),\s*so (?:that )?i can\s+(.+)$/iu.exec(value)
  const vietnamese = /^khi\s+(.+?),\s*tôi muốn\s+(.+?),\s*để tôi có thể\s+(.+)$/iu.exec(value)
  const match = english ?? vietnamese
  const failures: string[] = []
  if (match === null) failures.push('AUDIENCE_JOB_FORMAT')
  else if ([match[1], match[2], match[3]].some((part) => part === undefined || words(part) < 5)) {
    failures.push('AUDIENCE_JOB_COMPONENT_MIN_5_WORDS')
  }
  for (const topic of topicNames) {
    if (normalized.includes(topic.normalize('NFC').toLocaleLowerCase('en-US'))) {
      failures.push(`AUDIENCE_JOB_CONTAINS_TOPIC:${topic}`)
    }
  }
  return { valid: failures.length === 0, failures }
}
