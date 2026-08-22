import { describe, expect, it } from 'vitest'

import { streamHash } from '../src/index.js'

async function* chunks(values: readonly string[]): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder()
  for (const value of values) yield encoder.encode(value)
}

describe('streamHash', () => {
  it('hashes stream bytes independently of chunk boundaries', async () => {
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    await expect(streamHash(chunks(['a', 'b', 'c']))).resolves.toBe(expected)
    await expect(streamHash(chunks(['abc']))).resolves.toBe(expected)
  })
})
