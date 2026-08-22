import { performance } from 'node:perf_hooks'

import { describe, expect, it } from 'vitest'

import type {
  ChannelId,
  PackageId,
  StageInstanceId,
} from '@youtube-ai-factory/contracts'
import { thresholds } from '@youtube-ai-factory/contracts'

import type { DoREvidenceRepository, DoREvidenceSnapshot, DoRRequest } from '../src/index.js'
import { DoRResolver } from '../src/index.js'

const RUN_COUNT = 500

describe('DoRResolver performance', () => {
  it('keeps p95 below 200 ms with an in-memory evidence query', async () => {
    const snapshot: DoREvidenceSnapshot = {
      leaseValid: true,
      parents: [],
      gates: [],
      capabilities: [],
      activeProviderRequestCount: 0,
      unreconciledExpiredLeaseCount: 0,
      availableBudgetUsd: 0,
      quarantinedInputHashes: [],
      conflictingProviderRequestCount: 0,
      channelFrozen: false,
      humanDecisionCount: 0,
    }
    const repository: DoREvidenceRepository = { loadEvidence: () => snapshot }
    const resolver = new DoRResolver(repository)
    const request: DoRRequest = {
      stageInstanceId: 'stage' as StageInstanceId,
      packageId: 'package' as PackageId,
      channelId: 'channel' as ChannelId,
      stageOrdinal: 0,
      requiredStandardVersion: 0,
      estimatedCostUsd: 0,
      requiredCapabilities: [],
    }
    const durations: number[] = []

    for (let index = 0; index < RUN_COUNT; index += 1) {
      const startedAt = performance.now()
      await resolver.resolve(request)
      durations.push(performance.now() - startedAt)
    }

    durations.sort((left, right) => left - right)
    const p95Index = Math.ceil(durations.length * 0.95) - 1
    expect(durations[p95Index]).toBeLessThanOrEqual(thresholds.DOR.P95_MAX_MS)
  })
})
