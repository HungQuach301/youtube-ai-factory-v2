import type { ParsedNumber } from './types.js'

const NUMBER_PATTERN = /(?<qualifier>about|approximately|around|over|more than|under|less than)?\s*(?<currency>[$€£])?\s*(?<number>\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?<suffix>k|m|bn|billion|million|thousand)?\s*(?<unit>%|percent|percentage points?|bps|basis points?)?/giu

const multiplier = (suffix: string | undefined): number => {
  switch (suffix?.toLowerCase()) {
    case 'k': case 'thousand': return 1_000
    case 'm': case 'million': return 1_000_000
    case 'bn': case 'billion': return 1_000_000_000
    default: return 1
  }
}

const currency = (symbol: string | undefined): ParsedNumber['currency'] => {
  if (symbol === '$') return 'USD'
  if (symbol === '€') return 'EUR'
  if (symbol === '£') return 'GBP'
  return null
}

const qualifier = (value: string | undefined): ParsedNumber['qualifier'] => {
  const normalized = value?.toLowerCase()
  if (normalized === 'over' || normalized === 'more than') return 'MORE_THAN'
  if (normalized === 'under' || normalized === 'less than') return 'LESS_THAN'
  if (normalized === 'about' || normalized === 'approximately' || normalized === 'around') return 'ABOUT'
  return 'EXACT'
}

export const parseNumbers = (text: string): readonly ParsedNumber[] => [...text.matchAll(NUMBER_PATTERN)].map((match) => {
  const groups = match.groups ?? {}
  const rawNumber = groups['number']
  if (rawNumber === undefined) throw new Error('NUMERIC_PARSE_MISSING_NUMBER')
  const parsed = Number(rawNumber.replaceAll(',', '')) * multiplier(groups['suffix'])
  const unitToken = groups['unit']?.toLowerCase()
  const unit: ParsedNumber['unit'] = unitToken?.includes('bp') || unitToken?.includes('basis')
    ? 'BASIS_POINT'
    : unitToken === '%' || unitToken?.startsWith('percent') === true
      ? 'PERCENT'
      : 'NUMBER'
  return {
    raw: match[0].trim(),
    value: parsed,
    unit,
    currency: currency(groups['currency']),
    qualifier: qualifier(groups['qualifier']),
  }
})
