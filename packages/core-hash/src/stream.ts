import type { Hex64 } from '@youtube-ai-factory/contracts'

import { Sha256 } from './sha256.js'

export type HashByteStream = Iterable<Uint8Array> | AsyncIterable<Uint8Array>

export async function streamHash(source: HashByteStream): Promise<Hex64> {
  const hash = new Sha256()
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('streamHash accepts Uint8Array chunks only')
    hash.update(chunk)
  }
  return hash.digestHex() as Hex64
}
