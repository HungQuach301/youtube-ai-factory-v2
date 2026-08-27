import type {
  CapabilityId,
  CostEstimate,
  ErrorClass,
  Hex64,
  ProviderAdapter,
} from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

export interface ElevenLabsVoiceSettings {
  readonly stability: number
  readonly similarityBoost: number
  readonly style?: number
  readonly useSpeakerBoost?: boolean
  readonly speed?: number
}

export interface ElevenLabsTtsRequest {
  readonly text: string
  readonly previousText?: string
  readonly nextText?: string
  readonly previousRequestIds?: readonly string[]
  readonly nextRequestIds?: readonly string[]
}

export interface ElevenLabsTtsResponse {
  readonly audio: Uint8Array
  readonly requestId: string | null
  readonly billedCharacters: number
}

export interface ElevenLabsTtsConfig {
  readonly apiKey: string
  readonly capabilityId: CapabilityId
  readonly version: string
  readonly voiceId: string
  readonly modelId: string
  readonly voiceSettings: ElevenLabsVoiceSettings
  readonly outputFormat: string
  readonly usdPer1000Chars: number
  readonly baseUrl?: string
}

export interface ElevenLabsTtsDependencies {
  readonly fetch?: typeof globalThis.fetch
}

class ElevenLabsTtsValidationError extends Error {
  override readonly name = 'ElevenLabsTtsValidationError'
}

class ElevenLabsTtsTransportError extends Error {
  override readonly name = 'ElevenLabsTtsTransportError'

  constructor(
    readonly status: number,
    readonly providerStatus: string | null,
    message: string,
  ) {
    super(message)
  }
}

function assertFiniteRange(value: number, name: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ElevenLabsTtsValidationError(`${name} must be between ${min} and ${max}.`)
  }
}

function assertConfig(config: ElevenLabsTtsConfig): void {
  for (const [name, value] of [
    ['apiKey', config.apiKey],
    ['capabilityId', config.capabilityId],
    ['version', config.version],
    ['voiceId', config.voiceId],
    ['modelId', config.modelId],
    ['outputFormat', config.outputFormat],
  ] as const) {
    if (value.trim().length === 0) throw new ElevenLabsTtsValidationError(`${name} is required.`)
  }
  if (!Number.isFinite(config.usdPer1000Chars) || config.usdPer1000Chars <= 0) {
    throw new ElevenLabsTtsValidationError('usdPer1000Chars must be positive and finite.')
  }
  assertFiniteRange(config.voiceSettings.stability, 'stability', 0, 1)
  assertFiniteRange(config.voiceSettings.similarityBoost, 'similarityBoost', 0, 1)
  if (config.voiceSettings.style !== undefined) {
    assertFiniteRange(config.voiceSettings.style, 'style', 0, 1)
  }
  if (config.voiceSettings.speed !== undefined) {
    assertFiniteRange(config.voiceSettings.speed, 'speed', 0.7, 1.2)
  }
}

function assertRequest(request: ElevenLabsTtsRequest): void {
  if (request.text.trim().length === 0) {
    throw new ElevenLabsTtsValidationError('TTS text must not be empty.')
  }
  for (const [name, ids] of [
    ['previousRequestIds', request.previousRequestIds],
    ['nextRequestIds', request.nextRequestIds],
  ] as const) {
    if (ids !== undefined && (ids.length > 3 || ids.some((id) => id.trim().length === 0))) {
      throw new ElevenLabsTtsValidationError(`${name} must contain one to three non-empty IDs.`)
    }
  }
}

function providerSettings(config: ElevenLabsTtsConfig): Record<string, unknown> {
  return {
    provider: 'elevenlabs',
    capabilityId: config.capabilityId,
    version: config.version,
    voiceId: config.voiceId,
    modelId: config.modelId,
    voiceSettings: config.voiceSettings,
    outputFormat: config.outputFormat,
    usdPer1000Chars: config.usdPer1000Chars,
  }
}

function requestBody(config: ElevenLabsTtsConfig, request: ElevenLabsTtsRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: request.text,
    model_id: config.modelId,
    voice_settings: {
      stability: config.voiceSettings.stability,
      similarity_boost: config.voiceSettings.similarityBoost,
      ...(config.voiceSettings.style === undefined ? {} : { style: config.voiceSettings.style }),
      ...(config.voiceSettings.useSpeakerBoost === undefined
        ? {}
        : { use_speaker_boost: config.voiceSettings.useSpeakerBoost }),
      ...(config.voiceSettings.speed === undefined ? {} : { speed: config.voiceSettings.speed }),
    },
  }
  if (request.previousRequestIds !== undefined && request.previousRequestIds.length > 0) {
    body['previous_request_ids'] = request.previousRequestIds
  } else if (request.previousText !== undefined) {
    body['previous_text'] = request.previousText
  }
  if (request.nextRequestIds !== undefined && request.nextRequestIds.length > 0) {
    body['next_request_ids'] = request.nextRequestIds
  } else if (request.nextText !== undefined) {
    body['next_text'] = request.nextText
  }
  return body
}

async function transportError(response: Response): Promise<ElevenLabsTtsTransportError> {
  let providerStatus: string | null = null
  let message = `ElevenLabs returned HTTP ${response.status}.`
  try {
    const payload: unknown = await response.json()
    if (payload !== null && typeof payload === 'object') {
      const detail = (payload as Record<string, unknown>)['detail']
      if (detail !== null && typeof detail === 'object') {
        const record = detail as Record<string, unknown>
        if (typeof record['status'] === 'string') providerStatus = record['status']
        if (typeof record['message'] === 'string') message = record['message']
      }
    }
  } catch {
    // Preserve the status-only error when the provider body is not JSON.
  }
  return new ElevenLabsTtsTransportError(response.status, providerStatus, message)
}

function classify(error: unknown): ErrorClass {
  if (error instanceof ElevenLabsTtsValidationError) return 'SCHEMA_VIOLATION'
  if (error instanceof TypeError) return 'TRANSIENT'
  if (!(error instanceof ElevenLabsTtsTransportError)) return 'PROVIDER_ERROR'
  const status = error.providerStatus?.toLowerCase() ?? ''
  if (status.includes('quota')) return 'BUDGET_DENIED'
  if (status.includes('policy') || status.includes('content')) return 'CONTENT_FILTERED'
  if (error.status === 429) return 'RATE_LIMIT'
  if (error.status >= 500) return 'TRANSIENT'
  if (error.status === 403 || error.status === 451) return 'RIGHTS_DENIED'
  if (error.status === 400 || error.status === 404 || error.status === 422) {
    return 'SCHEMA_VIOLATION'
  }
  return 'PROVIDER_ERROR'
}

export function createElevenLabsTtsAdapter(
  config: ElevenLabsTtsConfig,
  dependencies: ElevenLabsTtsDependencies = {},
): ProviderAdapter<ElevenLabsTtsRequest, ElevenLabsTtsResponse> {
  assertConfig(config)
  const fetchImpl = dependencies.fetch ?? globalThis.fetch
  const baseUrl = (config.baseUrl ?? 'https://api.elevenlabs.io').replace(/\/$/u, '')
  const settingsHash = canonicalHash(providerSettings(config)) as Hex64

  return {
    capabilityId: config.capabilityId,
    version: config.version,
    settingsHash,
    estimateCost(request): CostEstimate {
      assertRequest(request)
      const characters = request.text.length
      const maxCostUsd = (characters * config.usdPer1000Chars) / 1000
      return {
        maxCostUsd,
        basis: 'char_count',
        detail: {
          characters,
          usd_per_1000_chars: config.usdPer1000Chars,
        },
      }
    },
    async dispatch(request, _idempotencyKey): Promise<ElevenLabsTtsResponse> {
      assertRequest(request)
      const response = await fetchImpl(
        `${baseUrl}/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=${encodeURIComponent(config.outputFormat)}`,
        {
          method: 'POST',
          headers: {
            accept: 'audio/mpeg',
            'content-type': 'application/json',
            'xi-api-key': config.apiKey,
          },
          body: JSON.stringify(requestBody(config, request)),
        },
      )
      if (!response.ok) throw await transportError(response)
      return {
        audio: new Uint8Array(await response.arrayBuffer()),
        requestId: response.headers.get('request-id'),
        billedCharacters: request.text.length,
      }
    },
    actualCost(response): number {
      return (response.billedCharacters * config.usdPer1000Chars) / 1000
    },
    normalizeError: classify,
  }
}
