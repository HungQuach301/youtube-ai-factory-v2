import type {
  LeaseEvent,
  LeaseRepository,
  LeaseScope,
  LeaseState,
  MaybePromise,
} from './types.js'

export interface DurableObjectStoragePort {
  get<T>(key: string): MaybePromise<T | undefined>
  put<T>(key: string, value: T): MaybePromise<void>
}

interface LeaseAggregate {
  readonly state: LeaseState
  readonly events: readonly LeaseEvent[]
}

function storageKey(scope: LeaseScope): string {
  return `lease:${encodeURIComponent(scope.channelId)}:${encodeURIComponent(scope.packageId)}`
}

export class DurableLeaseRepository implements LeaseRepository {
  constructor(private readonly storage: DurableObjectStoragePort) {}

  async load(scope: LeaseScope): Promise<LeaseState | undefined> {
    return (await this.storage.get<LeaseAggregate>(storageKey(scope)))?.state
  }

  async commit(state: LeaseState, event: LeaseEvent): Promise<void> {
    const key = storageKey(state.scope)
    const current = await this.storage.get<LeaseAggregate>(key)
    const aggregate: LeaseAggregate = {
      state,
      events: [...(current?.events ?? []), event],
    }
    await this.storage.put(key, aggregate)
  }

  async listEvents(scope: LeaseScope): Promise<readonly LeaseEvent[]> {
    return (await this.storage.get<LeaseAggregate>(storageKey(scope)))?.events ?? []
  }
}
