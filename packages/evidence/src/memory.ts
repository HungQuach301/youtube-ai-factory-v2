import type { R2Key } from '@youtube-ai-factory/contracts'
import { canonicalizeExact } from '@youtube-ai-factory/core-hash'

import { EvidenceError } from './errors.js'
import type {
  EvidenceObjectMetadata,
  EvidenceObjectStore,
  EvidenceRecord,
  EvidenceRegistry,
} from './types.js'

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index])
}

export class InMemoryEvidenceObjectStore implements EvidenceObjectStore {
  readonly #objects = new Map<string, { bytes: Uint8Array, metadata: EvidenceObjectMetadata }>()

  get size(): number {
    return this.#objects.size
  }

  async putImmutable(
    key: R2Key,
    bytes: Uint8Array,
    metadata: EvidenceObjectMetadata,
  ): Promise<void> {
    const existing = this.#objects.get(key)
    if (existing !== undefined) {
      if (!equalBytes(existing.bytes, bytes)
        || canonicalizeExact(existing.metadata) !== canonicalizeExact(metadata)) {
        throw new EvidenceError(
          'IMMUTABILITY_VIOLATION',
          `Evidence object ${key} already exists with different bytes or metadata.`,
        )
      }
      return
    }
    this.#objects.set(key, { bytes: bytes.slice(), metadata: { ...metadata } })
  }

  async get(key: R2Key): Promise<Uint8Array | null> {
    return this.#objects.get(key)?.bytes.slice() ?? null
  }
}

export class InMemoryEvidenceRegistry implements EvidenceRegistry {
  readonly #records = new Map<string, EvidenceRecord>()

  get size(): number {
    return this.#records.size
  }

  async register(record: EvidenceRecord): Promise<void> {
    const existing = this.#records.get(record.r2Key)
    if (existing !== undefined) {
      if (canonicalizeExact(existing) !== canonicalizeExact(record)) {
        throw new EvidenceError(
          'IMMUTABILITY_VIOLATION',
          `Evidence registry entry ${record.r2Key} is immutable.`,
        )
      }
      return
    }
    this.#records.set(record.r2Key, {
      ...record,
      attributes: { ...record.attributes },
      retention: { ...record.retention },
    })
  }

  async find(key: R2Key): Promise<EvidenceRecord | null> {
    const record = this.#records.get(key)
    return record === undefined ? null : {
      ...record,
      attributes: { ...record.attributes },
      retention: { ...record.retention },
    }
  }
}
