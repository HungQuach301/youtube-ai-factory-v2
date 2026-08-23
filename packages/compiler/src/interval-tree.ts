export interface Interval {
  readonly id: string
  readonly start: number
  readonly end: number
}

interface IntervalNode {
  readonly interval: Interval
  readonly maxEnd: number
  readonly left: IntervalNode | null
  readonly right: IntervalNode | null
}

const buildNode = (ordered: readonly Interval[]): IntervalNode | null => {
  if (ordered.length === 0) return null
  const middle = Math.floor(ordered.length / 2)
  const interval = ordered[middle]
  if (interval === undefined) return null
  const left = buildNode(ordered.slice(0, middle))
  const right = buildNode(ordered.slice(middle + 1))
  return {
    interval,
    left,
    right,
    maxEnd: Math.max(interval.end, left?.maxEnd ?? Number.NEGATIVE_INFINITY, right?.maxEnd ?? Number.NEGATIVE_INFINITY),
  }
}

const overlaps = (left: Interval, right: Interval): boolean => left.start < right.end && right.start < left.end

const queryNode = (node: IntervalNode | null, target: Interval, output: Interval[]): void => {
  if (node === null) return
  if (node.left !== null && node.left.maxEnd > target.start) queryNode(node.left, target, output)
  if (node.interval.id !== target.id && overlaps(node.interval, target)) output.push(node.interval)
  if (node.interval.start < target.end) queryNode(node.right, target, output)
}

export class IntervalTree {
  readonly #root: IntervalNode | null

  public constructor(intervals: readonly Interval[]) {
    this.#root = buildNode([...intervals].sort((left, right) => left.start - right.start || left.end - right.end))
  }

  public query(target: Interval): readonly Interval[] {
    const output: Interval[] = []
    queryNode(this.#root, target, output)
    return output
  }
}

export const findOverlapPairs = (intervals: readonly Interval[]): readonly [string, string][] => {
  const tree = new IntervalTree(intervals)
  const pairs = new Set<string>()
  for (const interval of intervals) {
    for (const match of tree.query(interval)) {
      const ids = [interval.id, match.id].sort()
      pairs.add(String(ids[0]) + '\u0000' + String(ids[1]))
    }
  }
  return [...pairs].sort().map((pair) => {
    const [left, right] = pair.split('\u0000')
    if (left === undefined || right === undefined) throw new Error('INTERVAL_PAIR_DECODE_FAILED')
    return [left, right]
  })
}
