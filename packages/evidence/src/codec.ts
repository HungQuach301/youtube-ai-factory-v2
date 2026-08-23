import { canonicalizeExact } from '@youtube-ai-factory/core-hash'

import { EvidenceError } from './errors.js'

async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  const buffer = new ArrayBuffer(bytes.byteLength)
  const chunk = new Uint8Array(buffer)
  chunk.set(bytes)
  await writer.write(chunk)
  await writer.close()
  return new Uint8Array(await new Response(stream.readable).arrayBuffer())
}

export async function encodeGzipJson(value: unknown): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new EvidenceError('CODEC_UNAVAILABLE', 'gzip CompressionStream is unavailable.')
  }
  return transform(
    new TextEncoder().encode(canonicalizeExact(value)),
    new CompressionStream('gzip'),
  )
}

export async function decodeGzipJson(bytes: Uint8Array): Promise<unknown> {
  if (typeof DecompressionStream === 'undefined') {
    throw new EvidenceError('CODEC_UNAVAILABLE', 'gzip DecompressionStream is unavailable.')
  }
  const decoded = await transform(bytes, new DecompressionStream('gzip'))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded)) as unknown
}
