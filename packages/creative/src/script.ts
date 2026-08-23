import { thresholds } from '@youtube-ai-factory/contracts'
import { lintAdvice, parseNumbers } from '@youtube-ai-factory/truth-layer'
import { z } from 'zod'

import {
  NumberBindingSchema,
  NumericClaimSchema,
  ScriptSectionSchema,
  type LintResult,
  type NumberBinding,
  type NumericClaim,
  type ScriptLintResult,
  type ScriptSection,
} from './types.js'

const NumberAuditInputSchema = z.object({
  sections: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) }).strict()),
  numericClaims: z.array(NumericClaimSchema),
  numberBindings: z.array(NumberBindingSchema),
}).strict()

const ScriptLintInputSchema = z.object({
  sections: z.array(ScriptSectionSchema).min(1),
  arpabetLexicon: z.record(z.string(), z.string().min(1)),
  numericClaims: z.array(NumericClaimSchema),
  numberBindings: z.array(NumberBindingSchema),
}).strict()

const words = (text: string): readonly string[] => text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/gu) ?? []

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]!
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

function paceRange(kind: ScriptSection['kind']): { readonly min: number; readonly max: number } {
  if (kind === 'HOOK' || kind === 'ESCALATION') return thresholds.SCRIPT.SYLLABLES_PER_SEC_HOOK
  if (kind === 'DENSE_MECHANISM') return thresholds.SCRIPT.SYLLABLES_PER_SEC_DENSE_MECHANISM
  if (kind === 'PAYOFF') return thresholds.SCRIPT.SYLLABLES_PER_SEC_PAYOFF
  return thresholds.SCRIPT.SYLLABLES_PER_SEC
}

function countSyllables(
  section: ScriptSection,
  lexicon: Readonly<Record<string, string>>,
): { readonly count: number; readonly missing: readonly string[] } {
  let count = 0
  const missing = new Set<string>()
  for (const token of words(section.text)) {
    const pronunciation = lexicon[token]
    if (pronunciation === undefined) {
      missing.add(token)
      continue
    }
    const syllables = pronunciation.match(/[012]/gu)?.length ?? 0
    if (syllables === 0) missing.add(token)
    else count += syllables
  }
  return { count, missing: [...missing] }
}

const sameNumericClaim = (
  parsed: ReturnType<typeof parseNumbers>[number],
  claim: NumericClaim,
): boolean => parsed.value === claim.value && parsed.unit === claim.unit && parsed.currency === claim.currency

export function auditNumbers(input: unknown): LintResult {
  const parsed = NumberAuditInputSchema.parse(input)
  const failures: string[] = []
  const claims = new Map(parsed.numericClaims.map((claim) => [claim.claimId, claim]))
  const bindingKeys = new Set<string>()
  for (const binding of parsed.numberBindings) {
    const key = `${binding.sectionId}:${binding.numberIndex}`
    if (bindingKeys.has(key)) failures.push(`NUMBER_BINDING_DUPLICATE:${key}`)
    bindingKeys.add(key)
  }
  for (const section of parsed.sections) {
    const numbers = parseNumbers(section.text)
    numbers.forEach((number, numberIndex) => {
      const binding: NumberBinding | undefined = parsed.numberBindings.find((candidate) => (
        candidate.sectionId === section.id && candidate.numberIndex === numberIndex
      ))
      if (binding === undefined) {
        failures.push(`NUMBER_UNBOUND:${section.id}:${numberIndex}:${number.raw}`)
        return
      }
      const claim = claims.get(binding.claimId)
      if (claim === undefined) {
        failures.push(`NUMERIC_CLAIM_MISSING:${binding.claimId}`)
      } else if (!sameNumericClaim(number, claim)) {
        failures.push(`NUMBER_CLAIM_MISMATCH:${section.id}:${numberIndex}:${binding.claimId}`)
      }
    })
  }
  return { valid: failures.length === 0, failures }
}

export function lintScript(input: unknown): ScriptLintResult {
  const parsed = ScriptLintInputSchema.parse(input)
  const failures: string[] = []
  const warnings: string[] = []
  let totalSyllables = 0
  let totalDurationSec = 0
  for (const section of parsed.sections) {
    const advice = lintAdvice(section.text)
    failures.push(...advice.map((finding) => `ADVICE_LINT:${finding.code}`))
    const syllables = countSyllables(section, parsed.arpabetLexicon)
    failures.push(...syllables.missing.map((token) => `PRONUNCIATION_MISSING:${section.id}:${token}`))
    totalSyllables += syllables.count
    totalDurationSec += section.durationSec
    if (syllables.missing.length === 0) {
      const rate = syllables.count / section.durationSec
      const range = paceRange(section.kind)
      if (rate < range.min || rate > range.max) failures.push(`SYLLABLE_PACE_OUT_OF_RANGE:${section.id}:${rate}`)
    }

    const sentences = section.text.split(/[.!?]+/u).map((sentence) => words(sentence).length).filter((count) => count > 0)
    const sentenceMedian = median(sentences)
    if (sentenceMedian < thresholds.SCRIPT.SENTENCE_WORDS_MEDIAN.min || sentenceMedian > thresholds.SCRIPT.SENTENCE_WORDS_MEDIAN.max) {
      failures.push(`SENTENCE_MEDIAN_OUT_OF_RANGE:${section.id}:${sentenceMedian}`)
    }
    sentences.forEach((count, index) => {
      if (count > thresholds.SCRIPT.SENTENCE_WORDS_REVIEW) warnings.push(`SENTENCE_REVIEW_REQUIRED:${section.id}:${index}:${count}`)
    })

    const breathGroups = section.text.split(/[,;:—–-]|[.!?]+/u).map((group) => words(group).length).filter((count) => count > 0)
    breathGroups.forEach((count, index) => {
      if (count < thresholds.SCRIPT.BREATH_GROUP_WORDS.min || count > thresholds.SCRIPT.BREATH_GROUP_WORDS.max) {
        failures.push(`BREATH_GROUP_OUT_OF_RANGE:${section.id}:${index}:${count}`)
      }
    })
  }
  if (totalDurationSec > 0 && failures.every((failure) => !failure.startsWith('PRONUNCIATION_MISSING:'))) {
    const overallRate = totalSyllables / totalDurationSec
    if (overallRate < thresholds.SCRIPT.SYLLABLES_PER_SEC.min || overallRate > thresholds.SCRIPT.SYLLABLES_PER_SEC.max) {
      failures.push(`OVERALL_SYLLABLE_PACE_OUT_OF_RANGE:${overallRate}`)
    }
  }
  const numberAudit = auditNumbers({
    sections: parsed.sections.map((section) => ({ id: section.id, text: section.text })),
    numericClaims: parsed.numericClaims,
    numberBindings: parsed.numberBindings,
  })
  failures.push(...numberAudit.failures)
  return { valid: failures.length === 0, failures, warnings }
}
