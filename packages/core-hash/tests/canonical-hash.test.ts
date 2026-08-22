import { describe, expect, it } from 'vitest'

import { canonicalHash, canonicalize } from '../src/index.js'

function permutation(seed: number): Record<string, unknown> {
  const entries: [string, unknown][] = [
    ['alpha', { z: 3, a: 'café' }],
    ['beta', [true, null, 4.5]],
    ['gamma', 333333333.33333329],
    ['delta', 'value']
  ]
  let state = seed + 1
  for (let index = entries.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const selected = state % (index + 1)
    const current = entries[index]
    const other = entries[selected]
    if (current && other) {
      entries[index] = other
      entries[selected] = current
    }
  }
  return Object.fromEntries(entries)
}

describe('RFC 8785 canonical hashing', () => {
  it('produces one hash for 1,000 key-order permutations', () => {
    const hashes = new Set(Array.from({ length: 1000 }, (_, seed) => canonicalHash(permutation(seed))))
    expect(hashes.size).toBe(1)
  })

  it('normalizes NFC and NFD in both keys and values', () => {
    const nfc = { café: 'Ångström' }
    const nfd = { ['café'.normalize('NFD')]: 'Ångström'.normalize('NFD') }
    expect(canonicalHash(nfd)).toBe(canonicalHash(nfc))
  })

  it('serializes numbers with ECMAScript Number::toString semantics', () => {
    expect(canonicalize([333333333.33333329, 1e30, 4.50, 2e-3, 1e-27]))
      .toBe('[333333333.3333333,1e+30,4.5,0.002,1e-27]')
  })

  it('sorts object properties by UTF-16 code units', () => {
    const value = { '\u20ac': 'euro', '\r': 'cr', '\ufb33': 'hebrew', '1': 'one', '\ud83d\ude00': 'emoji', '\u0080': 'control', '\u00f6': 'latin' }
    expect(canonicalize(value)).toBe('{"\\r":"cr","1":"one","":"control","ö":"latin","€":"euro","😀":"emoji","דּ":"hebrew"}')
  })

  it('strips only declared volatile fields recursively', () => {
    const stable = { id: 'x', nested: { value: 1 } }
    const volatile = { id: 'x', timestamp: 'now', nested: { value: 1, request_id: 'r', latency: 2, nonce: 'n' } }
    expect(canonicalHash(volatile)).toBe(canonicalHash(stable))
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['undefined', undefined],
    ['BigInt', BigInt(1)],
    ['sparse array', Array(2)],
    ['cyclic object', (() => { const value: Record<string, unknown> = {}; value.self = value; return value })()],
    ['lone surrogate', '\ud800'],
    ['symbol property', { [Symbol('hidden')]: 1 }],
    ['accessor property', Object.defineProperty({}, 'value', { enumerable: true, get: () => 1 })]
  ])('rejects non-I-JSON input: %s', (_label, value) => {
    expect(() => canonicalHash(value)).toThrow()
  })

  it('rejects keys that collide after NFC normalization', () => {
    expect(() => canonicalHash({ 'é': 1, ['é'.normalize('NFD')]: 2 })).toThrow(/collision/iu)
  })
})
