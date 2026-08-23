import type { AdviceFinding } from './types.js'

const RULES: readonly { readonly code: AdviceFinding['code']; readonly pattern: RegExp }[] = [
  { code: 'DIRECT_ADVICE', pattern: /\b(?:you should|you need to|you must|i recommend|consider (?:buying|selling|investing)|bạn nên|bạn cần|hãy)\b/iu },
  { code: 'INDIRECT_ADVICE', pattern: /\b(?:many people (?:have )?chosen to|the best (?:move|choice) is to|smart investors (?:are|have been))\b/iu },
  { code: 'PROFIT_PROMISE', pattern: /\b(?:if you want to (?:increase|maximi[sz]e|boost) (?:returns|profit)|to make money,? (?:buy|sell|invest)|double your money)\b/iu },
  { code: 'GUARANTEE', pattern: /\b(?:guaranteed returns?|risk[- ]free profit|cannot lose|can't lose|sure win)\b/iu },
]

export const lintAdvice = (text: string): readonly AdviceFinding[] => RULES.flatMap((rule) => {
  const match = rule.pattern.exec(text)
  return match === null ? [] : [{ code: rule.code, excerpt: match[0] }]
})
