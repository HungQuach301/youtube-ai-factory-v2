import type { ArchetypeId, CapabilityId, Hex64 } from '@youtube-ai-factory/contracts'
import { canonicalHash } from '@youtube-ai-factory/core-hash'

import type {
  ArchetypeRecord,
  CapabilityBinding,
  CapabilityRecord,
  CapabilitySettings,
  DispatchAuthorization,
  RegistrySnapshot,
} from './types.js'

const HEX_64 = /^[a-f0-9]{64}$/u
const MODEL_ALIAS = /(?:^|[-_/])(latest|default)(?:$|[-_/])/iu

function assertText(value: string, name: string): void {
  if (value.trim().length === 0) throw new TypeError(`${name} must not be empty.`)
}

function bindingKey(capabilityId: CapabilityId, archetypeId: ArchetypeId): string {
  return `${capabilityId}:${archetypeId}`
}

export function computeSettingsHash(settings: CapabilitySettings): Hex64 {
  assertText(settings.modelSnapshot, 'modelSnapshot')
  assertText(settings.systemPrompt, 'systemPrompt')
  if (MODEL_ALIAS.test(settings.modelSnapshot)) {
    throw new TypeError('Capability modelSnapshot must be a pinned snapshot, not latest/default.')
  }
  if (!Number.isFinite(settings.temperature) || !Number.isFinite(settings.topP)
    || !Number.isSafeInteger(settings.seed)) {
    throw new TypeError('Capability settings must contain finite sampling values and an integer seed.')
  }
  const systemPromptHash = canonicalHash({ system_prompt: settings.systemPrompt })
  return canonicalHash({
    model_snapshot: settings.modelSnapshot,
    response_format: settings.responseFormat,
    seed: settings.seed,
    system_prompt_hash: systemPromptHash,
    temperature: settings.temperature,
    top_p: settings.topP,
  })
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<CapabilityId, CapabilityRecord>()
  private readonly codeVersions = new Set<string>()
  private readonly archetypes = new Map<ArchetypeId, ArchetypeRecord>()
  private readonly bindings = new Map<string, CapabilityBinding>()

  constructor(snapshot: RegistrySnapshot = {}) {
    for (const archetype of snapshot.archetypes ?? []) this.registerArchetype(archetype)
    for (const capability of snapshot.capabilities ?? []) this.registerCapability(capability)
    for (const binding of snapshot.bindings ?? []) this.bind(binding)
  }

  registerCapability(record: CapabilityRecord): void {
    assertText(record.code, 'Capability code')
    assertText(record.version, 'Capability version')
    assertText(record.provider, 'Capability provider')
    assertText(record.modelSnapshot, 'Capability modelSnapshot')
    if (MODEL_ALIAS.test(record.modelSnapshot)) {
      throw new TypeError('Capability modelSnapshot must be a pinned snapshot, not latest/default.')
    }
    if (!HEX_64.test(record.settingsHash)) throw new TypeError('Capability settingsHash must be lowercase hex64.')
    if (!Number.isFinite(Date.parse(record.createdAt))) throw new TypeError('Capability createdAt must be a valid timestamp.')
    const versionKey = `${record.code}:${record.version}`
    if (this.capabilities.has(record.id) || this.codeVersions.has(versionKey)) {
      throw new TypeError('Capability id and code/version must be unique.')
    }
    this.capabilities.set(record.id, { ...record })
    this.codeVersions.add(versionKey)
  }

  registerArchetype(record: ArchetypeRecord): void {
    assertText(record.code, 'Archetype code')
    if (!Number.isFinite(record.minFirstPassYield)
      || record.minFirstPassYield < 0 || record.minFirstPassYield > 1) {
      throw new TypeError('Archetype minFirstPassYield must be between zero and one.')
    }
    if (this.archetypes.has(record.id)) throw new TypeError(`Archetype ${record.id} already exists.`)
    this.archetypes.set(record.id, { ...record })
  }

  bind(binding: CapabilityBinding): void {
    if (!this.capabilities.has(binding.capabilityId)) throw new TypeError('Binding capability does not exist.')
    if (!this.archetypes.has(binding.archetypeId)) throw new TypeError('Binding archetype does not exist.')
    if (binding.qualificationState === 'QUALIFIED'
      && (binding.qualificationRunId === null || binding.qualifiedAt === null)) {
      throw new TypeError('QUALIFIED binding requires a passing run reference and qualifiedAt.')
    }
    this.bindings.set(bindingKey(binding.capabilityId, binding.archetypeId), { ...binding })
  }

  authorize(
    capabilityId: CapabilityId,
    version: string,
    archetypeId: ArchetypeId,
  ): DispatchAuthorization {
    const capability = this.capabilities.get(capabilityId)
    if (capability === undefined || capability.version !== version || capability.status !== 'ACTIVE') {
      return { ok: false, reason: 'CAPABILITY_NOT_ACTIVE' }
    }
    const binding = this.bindings.get(bindingKey(capabilityId, archetypeId))
    if (binding === undefined || binding.qualificationState !== 'QUALIFIED') {
      return { ok: false, reason: 'BINDING_NOT_QUALIFIED' }
    }
    return { ok: true, capability: { ...capability }, binding: { ...binding } }
  }
}
