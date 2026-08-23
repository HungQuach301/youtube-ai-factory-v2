import { thresholds } from '@youtube-ai-factory/contracts'

const tokens = (value: string): readonly string[] => value.normalize('NFC').toLocaleLowerCase('en-US')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim().split(/\s+/u).filter(Boolean)

const shingles = (value: string, size: number): ReadonlySet<string> => {
  const values = tokens(value)
  const result = new Set<string>()
  for (let index = 0; index + size <= values.length; index += 1) {
    result.add(values.slice(index, index + size).join(' '))
  }
  return result
}

export const sharedNgramCount = (left: string, right: string, size: number): number => {
  const leftSet = shingles(left, size)
  const rightSet = shingles(right, size)
  return [...leftSet].filter((value) => rightSet.has(value)).length
}

export const ngramJaccard = (left: string, right: string, size: number): number => {
  const leftSet = shingles(left, size)
  const rightSet = shingles(right, size)
  const union = new Set([...leftSet, ...rightSet])
  if (union.size === 0) return 0
  return [...leftSet].filter((value) => rightSet.has(value)).length / union.size
}

const editDistance = (left: readonly string[], right: readonly string[]): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]
      const deletion = previous[rightIndex]
      const insertion = current[rightIndex - 1]
      if (substitution === undefined || deletion === undefined || insertion === undefined) throw new Error('ANTICOPY_MATRIX_BOUNDS')
      current[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? substitution
        : Math.min(substitution + 1, deletion + 1, insertion + 1)
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length] ?? left.length
}

export const beatSequenceDiff = (left: readonly string[], right: readonly string[]): number => {
  const denominator = Math.max(left.length, right.length)
  return denominator === 0 ? 0 : editDistance(left, right) / denominator
}

export const phashHamming = (left: string, right: string): number => {
  if (!/^[0-9a-f]{16}$/iu.test(left) || !/^[0-9a-f]{16}$/iu.test(right)) throw new Error('PHASH_MUST_BE_64_BIT_HEX')
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    const leftNibble = Number.parseInt(left[index] ?? '', 16)
    const rightNibble = Number.parseInt(right[index] ?? '', 16)
    let xor = leftNibble ^ rightNibble
    while (xor > 0) {
      distance += xor & 1
      xor >>>= 1
    }
  }
  return distance
}

export const cosineSimilarity = (left: readonly number[], right: readonly number[]): number => {
  if (left.length === 0 || left.length !== right.length) throw new Error('VECTOR_DIMENSION_MISMATCH')
  const dot = left.reduce((total, value, index) => total + value * (right[index] ?? 0), 0)
  const leftMagnitude = Math.sqrt(left.reduce((total, value) => total + value ** 2, 0))
  const rightMagnitude = Math.sqrt(right.reduce((total, value) => total + value ** 2, 0))
  if (leftMagnitude === 0 || rightMagnitude === 0) throw new Error('ZERO_VECTOR')
  return dot / (leftMagnitude * rightMagnitude)
}

export interface AntiCopyResult {
  readonly text: { readonly shared7GramCount: number; readonly jaccard5Gram: number; readonly pass: boolean }
  readonly beat: { readonly difference: number; readonly pass: boolean }
  readonly thumbnail: { readonly hamming: number; readonly pass: boolean }
  readonly title: { readonly cosine: number; readonly pass: boolean }
}

export const measureAntiCopy = (input: {
  readonly script: string
  readonly referenceTranscript: string
  readonly beats: readonly string[]
  readonly referenceBeats: readonly string[]
  readonly thumbnailPhash: string
  readonly referenceThumbnailPhash: string
  readonly titleVector: readonly number[]
  readonly referenceTitleVector: readonly number[]
}): AntiCopyResult => {
  const shared7GramCount = sharedNgramCount(input.script, input.referenceTranscript, thresholds.ANTICOPY.MAX_SHARED_NGRAM)
  const jaccard5Gram = ngramJaccard(input.script, input.referenceTranscript, 5)
  const difference = beatSequenceDiff(input.beats, input.referenceBeats)
  const hamming = phashHamming(input.thumbnailPhash, input.referenceThumbnailPhash)
  const cosine = cosineSimilarity(input.titleVector, input.referenceTitleVector)
  return {
    text: { shared7GramCount, jaccard5Gram, pass: shared7GramCount === 0 && jaccard5Gram <= thresholds.ANTICOPY.JACCARD_5GRAM_MAX },
    beat: { difference, pass: difference >= thresholds.ANTICOPY.BEAT_SEQUENCE_DIFF_MIN },
    thumbnail: { hamming, pass: hamming >= thresholds.ANTICOPY.THUMBNAIL_PHASH_HAMMING_MIN },
    title: { cosine, pass: cosine <= thresholds.ANTICOPY.TITLE_COSINE_MAX },
  }
}

export const differentiationScore = (route: readonly number[], references: readonly (readonly number[])[]): number => {
  if (references.length === 0) throw new Error('REFERENCE_SET_REQUIRED')
  if (route.length === 0 || references.some((reference) => reference.length !== route.length)) throw new Error('VECTOR_DIMENSION_MISMATCH')
  const centroid = route.map((_, dimension) => references.reduce((total, reference) => total + (reference[dimension] ?? 0), 0) / references.length)
  return Math.sqrt(route.reduce((total, value, dimension) => total + (value - (centroid[dimension] ?? 0)) ** 2, 0))
}
