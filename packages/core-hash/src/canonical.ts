import type { Hex64 } from '@youtube-ai-factory/contracts'

import { Sha256 } from './sha256.js'

const VOLATILE_FIELDS = new Set(['timestamp', 'request_id', 'latency', 'nonce'])

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('I-JSON forbids lone UTF-16 high surrogates')
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError('I-JSON forbids lone UTF-16 low surrogates')
    }
  }
}

function quote(value: string): string {
  const normalized = value.normalize('NFC')
  assertUnicodeScalarString(normalized)
  const serialized = JSON.stringify(normalized)
  if (serialized === undefined) throw new TypeError('String cannot be represented as I-JSON')
  return serialized
}

function serialize(value: unknown, ancestors: WeakSet<object>, stripVolatileFields: boolean): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('I-JSON requires finite numbers')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (typeof value !== 'object') throw new TypeError(`Unsupported I-JSON value: ${typeof value}`)
  if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot contain cycles')
  ancestors.add(value)

  try {
    if (Array.isArray(value)) {
      const items: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new TypeError('I-JSON forbids sparse arrays')
        items.push(serialize(value[index], ancestors, stripVolatileFields))
      }
      return `[${items.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON accepts only plain objects and arrays')
    }

    if (Object.getOwnPropertySymbols(value).some((symbol) => Object.prototype.propertyIsEnumerable.call(value, symbol))) {
      throw new TypeError('I-JSON objects cannot contain symbol properties')
    }

    const normalizedEntries = new Map<string, unknown>()
    for (const rawKey of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, rawKey)
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError('Canonical JSON rejects accessor properties')
      }
      const key = rawKey.normalize('NFC')
      assertUnicodeScalarString(key)
      if (stripVolatileFields && VOLATILE_FIELDS.has(key)) continue
      if (normalizedEntries.has(key)) throw new TypeError(`NFC key collision: ${key}`)
      normalizedEntries.set(key, descriptor.value)
    }

    return `{${Array.from(normalizedEntries.keys()).sort().map((key) => (
      `${quote(key)}:${serialize(normalizedEntries.get(key), ancestors, stripVolatileFields)}`
    )).join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

export function canonicalize(value: unknown): string {
  return serialize(value, new WeakSet(), true)
}

export function canonicalizeExact(value: unknown): string {
  return serialize(value, new WeakSet(), false)
}

export function canonicalHash(value: unknown): Hex64 {
  const bytes = new TextEncoder().encode(canonicalize(value))
  return new Sha256().update(bytes).digestHex() as Hex64
}
