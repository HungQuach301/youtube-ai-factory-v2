import type { CostEstimate } from '@youtube-ai-factory/contracts'

export interface TokenCounter<Input> {
  countTokens(input: Input): number
}

export interface TokenCostRequest<Input> {
  readonly prompt: Input
  readonly maxOutputTokens: number
}

export interface TokenPricing {
  readonly inputUsdPerToken: number
  readonly outputUsdPerToken: number
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number.`)
  }
}

function assertTokenCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} token count must be a non-negative safe integer.`)
  }
}

export function estimateTokenCost<Input>(
  request: TokenCostRequest<Input>,
  tokenizer: TokenCounter<Input>,
  pricing: TokenPricing,
): CostEstimate {
  const inputTokens = tokenizer.countTokens(request.prompt)
  assertTokenCount(inputTokens, 'Input')
  assertTokenCount(request.maxOutputTokens, 'Maximum output')
  assertNonNegativeFinite(pricing.inputUsdPerToken, 'Input token price')
  assertNonNegativeFinite(pricing.outputUsdPerToken, 'Output token price')

  const inputCostUsd = inputTokens * pricing.inputUsdPerToken
  const maxOutputCostUsd = request.maxOutputTokens * pricing.outputUsdPerToken
  return {
    maxCostUsd: inputCostUsd + maxOutputCostUsd,
    basis: 'token_count',
    detail: {
      input_tokens: inputTokens,
      max_output_tokens: request.maxOutputTokens,
      input_cost_usd: inputCostUsd,
      max_output_cost_usd: maxOutputCostUsd,
    },
  }
}
