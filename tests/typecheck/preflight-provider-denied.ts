import type { PreflightContext } from '@youtube-ai-factory/contracts'

declare const context: PreflightContext

context.measurements.values

// @ts-expect-error G6: PreflightContext intentionally has no provider client.
context.provider.execute({ prompt: 'must not compile' })

// @ts-expect-error G6: PreflightContext intentionally has no LLM client.
context.llm.invoke({ input: 'must not compile' })
